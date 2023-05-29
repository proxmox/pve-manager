include ../defines.mk

all:

.PHONY: install
install: mtu bridgevlan bridgevlanport vlan vlan-down
	install -D -m 0755 mtu $(DESTDIR)/etc/network/if-up.d/mtu
	install -D -m 0755 bridgevlan $(DESTDIR)/etc/network/if-up.d/bridgevlan
	install -D -m 0755 bridgevlanport $(DESTDIR)/etc/network/if-up.d/bridgevlanport
	install -D -m 0755 vlan $(DESTDIR)/etc/network/if-pre-up.d/vlan
	install -D -m 0755 vlan-down $(DESTDIR)/etc/network/if-post-down.d/vlan

clean:
