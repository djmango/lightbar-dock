#include <assert.h>
#include <stdio.h>

#include "status_config.h"
#include "status_logic.h"

static void repeat(
  port_status_context_t *context,
  bool attached,
  uint16_t current_ma,
  uint16_t samples
) {
  for (uint16_t sample = 0; sample < samples; sample++) {
    port_status_update(context, attached, current_ma);
  }
}

int main(void) {
  port_status_context_t context;
  port_status_init(&context);

  assert(context.status == PORT_STATUS_OFF);
  assert(!port_status_red(&context));
  assert(!port_status_green(&context));

  repeat(
    &context,
    true,
    STATUS_CHARGING_ON_MA,
    STATUS_ATTACH_DEBOUNCE_SAMPLES
  );
  assert(context.status == PORT_STATUS_STARTING);
  assert(port_status_red(&context));

  repeat(
    &context,
    true,
    STATUS_CHARGING_ON_MA,
    STATUS_STARTUP_SETTLE_SAMPLES + 1u
  );
  assert(context.status == PORT_STATUS_CHARGING);
  assert(port_status_red(&context));

  repeat(
    &context,
    true,
    STATUS_DONE_MAX_MA,
    STATUS_DONE_DWELL_SAMPLES - 1u
  );
  assert(context.status == PORT_STATUS_CHARGING);
  port_status_update(&context, true, STATUS_DONE_MAX_MA);
  assert(context.status == PORT_STATUS_DONE);
  assert(port_status_green(&context));

  port_status_update(&context, true, STATUS_CHARGING_ON_MA);
  assert(context.status == PORT_STATUS_CHARGING);
  assert(port_status_red(&context));

  repeat(
    &context,
    false,
    0u,
    STATUS_DETACH_DEBOUNCE_SAMPLES - 1u
  );
  assert(context.status == PORT_STATUS_CHARGING);
  port_status_update(&context, false, 0u);
  assert(context.status == PORT_STATUS_OFF);

  puts("status logic tests passed");
  return 0;
}
