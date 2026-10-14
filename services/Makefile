include ../defines.mk

all:

SERVICES=			\
	pvebanner.service 	\
	pvenetcommit.service 	\
	pvestatd.service 	\
	pve-guests.service 	\
	pvedaemon.service  	\
	pveproxy.service 	\
	spiceproxy.service	\
	pve-storage.target	\
	pve-daily-update.service\
	pve-daily-update.timer	\
	pvescheduler.service	\
	pve-sdn-commit.service	\
	pve-firewall-commit.service

.PHONY: install
install: $(SERVICES)
	install -d $(SERVICEDIR)
	install -m 0644 $(SERVICES) $(SERVICEDIR)
	install -d $(SERVICEDIR)/ceph-.service.d
	install -m 0644 ceph-after-pve-cluster.conf $(SERVICEDIR)/ceph-.service.d
	install -d $(SERVICEDIR)/rbdmap.service.d
	install -m 0644 ceph-after-pve-cluster.conf $(SERVICEDIR)/rbdmap.service.d
	install -d $(SERVICEDIR)/cephfs-mirror@.service.d
	install -m 0644 ceph-after-pve-cluster.conf $(SERVICEDIR)/cephfs-mirror@.service.d
	install -d $(DESTDIR)/usr/share/doc/$(PACKAGE)/examples/

.PHONY: clean
clean:
	rm -rf *~
