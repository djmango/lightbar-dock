#pragma once

#include <stdbool.h>
#include <stdint.h>

void status_hardware_init(void);
void status_hardware_watchdog_feed(void);
void status_hardware_delay_ms(uint32_t milliseconds);

void status_hardware_mux_select(uint8_t channel);
uint16_t status_hardware_adc_cc1(void);
uint16_t status_hardware_adc_cc2(void);

/* Returns milliamps from the INA3221 for port 0..7; 0 on I2C failure. */
uint16_t status_hardware_port_current_ma(uint8_t port);

void status_hardware_leds_write(uint16_t active_low_outputs);
void status_hardware_leds_enable(bool enabled);
