#include "status_hardware.h"

#include "status_config.h"

#include "ch32fun.h"

/* Locked V3 pin map (CH32V203F6P6 TSSOP-20). */
#define I2C_SDA_PIN PA0
#define I2C_SCL_PIN PA1
#define CC1_ADC_PIN PA2
#define CC2_ADC_PIN PA3
#define MUX_S0_PIN PA4
#define MUX_S1_PIN PA5
#define MUX_S2_PIN PA6
#define LED_DATA_PIN PA7
#define LED_CLOCK_PIN PB1
#define LED_LATCH_PIN PD0
#define LED_OUTPUT_ENABLE_PIN PD1

#define INA_REG_CONFIG 0x00u
#define INA_REG_SHUNT1 0x01u
#define INA_REG_SHUNT2 0x03u
#define INA_REG_SHUNT3 0x05u

static void watchdog_init(void) {
  IWDG->CTLR = 0x5555u;
  IWDG->PSCR = IWDG_Prescaler_256;
  IWDG->RLDR = 1000u;
  IWDG->CTLR = 0xAAAAu;
  IWDG->CTLR = 0xCCCCu;
}

static void remap_pd0_pd1(void) {
  RCC->APB2PCENR |= RCC_AFIOEN;
  AFIO->PCFR1 |= AFIO_PCFR1_PD01_REMAP;
}

static void i2c_delay(void) {
  Delay_Us(2u);
}

static void i2c_sda_high(void) {
  funPinMode(I2C_SDA_PIN, GPIO_CFGLR_IN_PUPD);
  funDigitalWrite(I2C_SDA_PIN, FUN_HIGH);
}

static void i2c_sda_low(void) {
  funPinMode(I2C_SDA_PIN, GPIO_CFGLR_OUT_10Mhz_OD);
  funDigitalWrite(I2C_SDA_PIN, FUN_LOW);
}

static void i2c_scl_high(void) {
  funPinMode(I2C_SCL_PIN, GPIO_CFGLR_IN_PUPD);
  funDigitalWrite(I2C_SCL_PIN, FUN_HIGH);
}

static void i2c_scl_low(void) {
  funPinMode(I2C_SCL_PIN, GPIO_CFGLR_OUT_10Mhz_OD);
  funDigitalWrite(I2C_SCL_PIN, FUN_LOW);
}

static void i2c_start(void) {
  i2c_sda_high();
  i2c_scl_high();
  i2c_delay();
  i2c_sda_low();
  i2c_delay();
  i2c_scl_low();
}

static void i2c_stop(void) {
  i2c_sda_low();
  i2c_delay();
  i2c_scl_high();
  i2c_delay();
  i2c_sda_high();
  i2c_delay();
}

static bool i2c_write_byte(uint8_t value) {
  for (int bit = 7; bit >= 0; bit--) {
    if (value & (uint8_t)(1u << bit)) {
      i2c_sda_high();
    } else {
      i2c_sda_low();
    }
    i2c_delay();
    i2c_scl_high();
    i2c_delay();
    i2c_scl_low();
  }
  i2c_sda_high();
  i2c_delay();
  i2c_scl_high();
  i2c_delay();
  const bool ack = funDigitalRead(I2C_SDA_PIN) == FUN_LOW;
  i2c_scl_low();
  return ack;
}

static uint8_t i2c_read_byte(bool ack) {
  uint8_t value = 0;
  i2c_sda_high();
  for (int bit = 7; bit >= 0; bit--) {
    i2c_delay();
    i2c_scl_high();
    i2c_delay();
    if (funDigitalRead(I2C_SDA_PIN) != FUN_LOW) {
      value |= (uint8_t)(1u << bit);
    }
    i2c_scl_low();
  }
  if (ack) {
    i2c_sda_low();
  } else {
    i2c_sda_high();
  }
  i2c_delay();
  i2c_scl_high();
  i2c_delay();
  i2c_scl_low();
  i2c_sda_high();
  return value;
}

static bool ina_read_reg(uint8_t addr7, uint8_t reg, uint16_t *out) {
  i2c_start();
  if (!i2c_write_byte((uint8_t)(addr7 << 1))) {
    i2c_stop();
    return false;
  }
  if (!i2c_write_byte(reg)) {
    i2c_stop();
    return false;
  }
  i2c_start();
  if (!i2c_write_byte((uint8_t)((addr7 << 1) | 1u))) {
    i2c_stop();
    return false;
  }
  const uint8_t msb = i2c_read_byte(true);
  const uint8_t lsb = i2c_read_byte(false);
  i2c_stop();
  *out = (uint16_t)(((uint16_t)msb << 8) | lsb);
  return true;
}

static uint16_t shunt_raw_to_ma(uint16_t raw) {
  int16_t signed_raw = (int16_t)raw;
  if (signed_raw < 0) {
    signed_raw = (int16_t)(-signed_raw);
  }
  /* mA = raw_lsb * 40uV / 0.1ohm / 1000 = raw * 0.4 */
  return (uint16_t)(((uint32_t)signed_raw * 2u) / 5u);
}

void status_hardware_init(void) {
  SystemInit();
  funGpioInitAll();
  remap_pd0_pd1();

  funPinMode(MUX_S0_PIN, GPIO_CFGLR_OUT_10Mhz_PP);
  funPinMode(MUX_S1_PIN, GPIO_CFGLR_OUT_10Mhz_PP);
  funPinMode(MUX_S2_PIN, GPIO_CFGLR_OUT_10Mhz_PP);
  funPinMode(LED_CLOCK_PIN, GPIO_CFGLR_OUT_10Mhz_PP);
  funPinMode(LED_DATA_PIN, GPIO_CFGLR_OUT_10Mhz_PP);
  funPinMode(LED_LATCH_PIN, GPIO_CFGLR_OUT_10Mhz_PP);
  funPinMode(LED_OUTPUT_ENABLE_PIN, GPIO_CFGLR_OUT_10Mhz_PP);

  funDigitalWrite(LED_OUTPUT_ENABLE_PIN, FUN_HIGH);
  funDigitalWrite(LED_LATCH_PIN, FUN_LOW);
  funDigitalWrite(LED_CLOCK_PIN, FUN_LOW);
  funDigitalWrite(LED_DATA_PIN, FUN_LOW);
  status_hardware_mux_select(0u);

  i2c_sda_high();
  i2c_scl_high();

  funAnalogInit();
  funPinMode(CC1_ADC_PIN, GPIO_CFGLR_IN_ANALOG);
  funPinMode(CC2_ADC_PIN, GPIO_CFGLR_IN_ANALOG);

  status_hardware_leds_write(UINT16_MAX);
  watchdog_init();
}

void status_hardware_watchdog_feed(void) {
  IWDG->CTLR = 0xAAAAu;
}

void status_hardware_delay_ms(uint32_t milliseconds) {
  Delay_Ms(milliseconds);
}

void status_hardware_mux_select(uint8_t channel) {
  funDigitalWrite(MUX_S0_PIN, (channel & 0x01u) != 0u);
  funDigitalWrite(MUX_S1_PIN, (channel & 0x02u) != 0u);
  funDigitalWrite(MUX_S2_PIN, (channel & 0x04u) != 0u);
  Delay_Us(30u);
}

uint16_t status_hardware_adc_cc1(void) {
  return (uint16_t)funAnalogRead(ANALOG_2);
}

uint16_t status_hardware_adc_cc2(void) {
  return (uint16_t)funAnalogRead(ANALOG_3);
}

uint16_t status_hardware_port_current_ma(uint8_t port) {
  static const struct {
    uint8_t addr;
    uint8_t reg;
  } map[8] = {
    {STATUS_INA_ADDR_U1, INA_REG_SHUNT3}, /* port 0 → U1 ch3 */
    {STATUS_INA_ADDR_U1, INA_REG_SHUNT2}, /* port 1 → U1 ch2 */
    {STATUS_INA_ADDR_U1, INA_REG_SHUNT1}, /* port 2 → U1 ch1 */
    {STATUS_INA_ADDR_U2, INA_REG_SHUNT3}, /* port 3 → U2 ch3 */
    {STATUS_INA_ADDR_U2, INA_REG_SHUNT2}, /* port 4 → U2 ch2 */
    {STATUS_INA_ADDR_U2, INA_REG_SHUNT1}, /* port 5 → U2 ch1 */
    {STATUS_INA_ADDR_U6, INA_REG_SHUNT3}, /* port 6 → U6 ch3 */
    {STATUS_INA_ADDR_U6, INA_REG_SHUNT1}, /* port 7 → U6 ch1 */
  };

  if (port >= 8u) {
    return 0;
  }
  uint16_t raw = 0;
  if (!ina_read_reg(map[port].addr, map[port].reg, &raw)) {
    return 0;
  }
  return shunt_raw_to_ma(raw);
}

void status_hardware_leds_write(uint16_t active_low_outputs) {
  funDigitalWrite(LED_LATCH_PIN, FUN_LOW);
  for (int bit = 15; bit >= 0; bit--) {
    funDigitalWrite(
      LED_DATA_PIN,
      (active_low_outputs & ((uint16_t)1u << bit)) != 0u
    );
    funDigitalWrite(LED_CLOCK_PIN, FUN_HIGH);
    funDigitalWrite(LED_CLOCK_PIN, FUN_LOW);
  }
  funDigitalWrite(LED_LATCH_PIN, FUN_HIGH);
}

void status_hardware_leds_enable(bool enabled) {
  funDigitalWrite(LED_OUTPUT_ENABLE_PIN, enabled ? FUN_LOW : FUN_HIGH);
}
