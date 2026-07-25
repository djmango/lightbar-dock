TARGET := status-controller
TARGET_MCU := CH32V203
TARGET_MCU_PACKAGE := CH32V203F6P6

CH32FUN_REPO ?= ../../third_party/ch32fun
CH32FUN ?= $(CH32FUN_REPO)/ch32fun
CH32FUN_COMMIT := d60d0fd344c3d453020b4dd1500e386e87335c16

EXTRA_CFLAGS += -Iinclude -std=gnu11 -Wall -Wextra
ADDITIONAL_C_FILES += src/status_logic.c src/status_hardware_ch32fun.c

all: build

build: cv

flash: cv_flash

verify-ch32fun:
	@test "$$(git -C "$(CH32FUN_REPO)" rev-parse HEAD)" = "$(CH32FUN_COMMIT)" || \
	  (echo "ch32fun must be at $(CH32FUN_COMMIT)"; exit 1)

include $(CH32FUN)/ch32fun.mk
