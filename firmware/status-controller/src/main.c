#include <stdbool.h>
#include <stdint.h>

#include "status_config.h"
#include "status_hardware.h"
#include "status_logic.h"

#define PORT_COUNT 8u

typedef struct {
  port_status_context_t status;
  uint32_t filtered_current_ma_q8;
  bool current_filter_initialized;
  bool attached;
} port_runtime_t;

static uint16_t filter_current(port_runtime_t *port, uint16_t sample_ma) {
  const uint32_t target = (uint32_t)sample_ma << 8u;
  if (!port->current_filter_initialized) {
    port->filtered_current_ma_q8 = target;
    port->current_filter_initialized = true;
  } else {
    const int32_t delta =
      (int32_t)target - (int32_t)port->filtered_current_ma_q8;
    port->filtered_current_ma_q8 =
      (uint32_t)((int32_t)port->filtered_current_ma_q8 +
                 (delta >> STATUS_CURRENT_FILTER_SHIFT));
  }
  return (uint16_t)(port->filtered_current_ma_q8 >> 8u);
}

static void update_attachment(port_runtime_t *port, uint16_t cc_adc) {
  if (!port->attached && cc_adc <= STATUS_CC_ATTACH_ADC_MAX) {
    port->attached = true;
  } else if (port->attached && cc_adc >= STATUS_CC_DETACH_ADC_MIN) {
    port->attached = false;
  }
}

int main(void) {
  port_runtime_t ports[PORT_COUNT] = {0};
  bool leds_enabled = false;

  for (uint8_t port = 0; port < PORT_COUNT; port++) {
    port_status_init(&ports[port].status);
  }

  status_hardware_init();

  while (true) {
    uint16_t cc_adc[PORT_COUNT] = {0};
    for (uint8_t channel = 0; channel < PORT_COUNT; channel++) {
      status_hardware_mux_select(channel);
      /* U8 → CC1 bank (ports 0-7), U9 → CC2; use the lower of the two. */
      const uint16_t cc1 = status_hardware_adc_cc1();
      const uint16_t cc2 = status_hardware_adc_cc2();
      cc_adc[channel] = cc1 < cc2 ? cc1 : cc2;
    }

    uint16_t led_outputs = UINT16_MAX;
    for (uint8_t port = 0; port < PORT_COUNT; port++) {
      update_attachment(&ports[port], cc_adc[port]);
      const uint16_t current_ma = filter_current(
        &ports[port],
        status_hardware_port_current_ma(port)
      );
      port_status_update(&ports[port].status, ports[port].attached, current_ma);

      if (port_status_red(&ports[port].status)) {
        led_outputs &= (uint16_t)~((uint16_t)1u << (port * 2u));
      }
      if (port_status_green(&ports[port].status)) {
        led_outputs &= (uint16_t)~((uint16_t)1u << (port * 2u + 1u));
      }
    }

    status_hardware_leds_write(led_outputs);
    if (!leds_enabled) {
      status_hardware_leds_enable(true);
      leds_enabled = true;
    }
    status_hardware_watchdog_feed();
    status_hardware_delay_ms(STATUS_SAMPLE_PERIOD_MS);
  }
}
