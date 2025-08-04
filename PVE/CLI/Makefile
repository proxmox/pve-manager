include ../../defines.mk

SOURCES = \
	vzdump.pm \
	pvesubscription.pm \
	pveceph.pm \
	pveam.pm \
	pvesr.pm \
	pvenode.pm \
	pvesh.pm \
	pve8to9.pm \
	proxmox_network_interface_pinning.pm \

all:

.PHONY: install
install: $(SOURCES)
	install -d -m 0755 $(PERLLIBDIR)/PVE/CLI
	for i in $(SOURCES); do install -D -m 0644 $$i $(PERLLIBDIR)/PVE/CLI/$$i; done


clean:
