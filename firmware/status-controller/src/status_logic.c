#include "status_logic.h"

#include "status_config.h"

static uint16_t saturating_increment(uint16_t value) {
  return value == UINT16_MAX ? value : (uint16_t)(value + 1u);
}

void port_status_init(port_status_context_t *context) {
  *context = (port_status_context_t){
    .status = PORT_STATUS_OFF,
  };
}

void port_status_update(
  port_status_context_t *context,
  bool attached,
  uint16_t current_ma
) {
  if (attached) {
    context->attach_samples = saturating_increment(context->attach_samples);
    context->detach_samples = 0;
  } else {
    context->detach_samples = saturating_increment(context->detach_samples);
    context->attach_samples = 0;
  }

  if (context->detach_samples >= STATUS_DETACH_DEBOUNCE_SAMPLES) {
    port_status_init(context);
    return;
  }

  if (context->status == PORT_STATUS_OFF) {
    if (context->attach_samples >= STATUS_ATTACH_DEBOUNCE_SAMPLES) {
      context->status = PORT_STATUS_STARTING;
      context->startup_samples = STATUS_STARTUP_SETTLE_SAMPLES;
    }
    return;
  }

  if (context->startup_samples > 0u) {
    context->startup_samples--;
    return;
  }

  if (current_ma >= STATUS_CHARGING_ON_MA) {
    context->status = PORT_STATUS_CHARGING;
    context->done_samples = 0;
    return;
  }

  if (current_ma <= STATUS_DONE_MAX_MA) {
    context->done_samples = saturating_increment(context->done_samples);
    if (context->done_samples >= STATUS_DONE_DWELL_SAMPLES) {
      context->status = PORT_STATUS_DONE;
    } else if (context->status == PORT_STATUS_STARTING) {
      context->status = PORT_STATUS_CHARGING;
    }
    return;
  }

  context->done_samples = 0;
  if (context->status == PORT_STATUS_STARTING) {
    context->status = PORT_STATUS_CHARGING;
  }
}

bool port_status_red(const port_status_context_t *context) {
  return context->status == PORT_STATUS_STARTING ||
         context->status == PORT_STATUS_CHARGING;
}

bool port_status_green(const port_status_context_t *context) {
  return context->status == PORT_STATUS_DONE;
}
