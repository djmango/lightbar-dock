#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef enum {
  PORT_STATUS_OFF = 0,
  PORT_STATUS_STARTING,
  PORT_STATUS_CHARGING,
  PORT_STATUS_DONE,
} port_status_t;

typedef struct {
  port_status_t status;
  uint16_t attach_samples;
  uint16_t detach_samples;
  uint16_t startup_samples;
  uint16_t done_samples;
} port_status_context_t;

void port_status_init(port_status_context_t *context);
void port_status_update(
  port_status_context_t *context,
  bool attached,
  uint16_t current_ma
);

bool port_status_red(const port_status_context_t *context);
bool port_status_green(const port_status_context_t *context);
