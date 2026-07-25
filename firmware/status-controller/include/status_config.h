#pragma once

/* All timing is expressed in 50 ms control-loop samples. */
#define STATUS_SAMPLE_PERIOD_MS 50u
#define STATUS_ATTACH_DEBOUNCE_SAMPLES 3u
#define STATUS_DETACH_DEBOUNCE_SAMPLES 3u
#define STATUS_STARTUP_SETTLE_SAMPLES 40u

/*
 * Indicator meanings (red = charging, green = done) are documented in
 * docs/SPECS.md. Calibrate these three values against production bars.
 */
#define STATUS_CHARGING_ON_MA 40u
#define STATUS_DONE_MAX_MA 20u
#define STATUS_DONE_DWELL_SAMPLES 200u

/*
 * 12-bit ADC at 3.3 V VDDA, after a 2:1 divider on the mux commons.
 * Thresholds are in raw ADC counts at the MCU pin (half of CC voltage).
 */
#define STATUS_ADC_FULL_SCALE_MV 3300u
#define STATUS_ADC_MAX_COUNT 4095u
#define STATUS_CC_ATTACH_ADC_MAX 660u
#define STATUS_CC_DETACH_ADC_MIN 920u

/* INA3221: 40 µV/LSB shunt; 0.1 ohm sense → 0.4 mA per LSB. */
#define STATUS_INA_SHUNT_OHM_X1000 100u
#define STATUS_INA_SHUNT_UV_PER_LSB 40u
#define STATUS_CURRENT_FILTER_SHIFT 3u

/* I2C 7-bit addresses (A0 wiring). */
#define STATUS_INA_ADDR_U6 0x40u /* A0 = GND */
#define STATUS_INA_ADDR_U2 0x41u /* A0 = VS (3.3 V) */
#define STATUS_INA_ADDR_U1 0x42u /* A0 = SDA */
