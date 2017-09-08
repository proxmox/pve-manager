include ../../defines.mk

all:

SCRIPTS = 		\
	pvedaemon 	\
	pveproxy 	\
	spiceproxy 	\
	pvestatd


SERVICES=			\
	pvebanner.service 	\
	pvenetcommit.service 	\
	pvestatd.service 	\
	pve-guests.service 	\
	pvedaemon.service  	\
	pveproxy.service 	\
	spiceproxy.service	\
	pve-storage.target	\
	pvesr.service		\
	pvesr.timer

.PHONY: install 
install: ${SCRIPTS}
	install -d ${INITDBINDIR}
	install -m 0755 ${SCRIPTS} ${INITDBINDIR}
	install -d ${SERVICEDIR}
	install -m 0644 ${SERVICES} ${SERVICEDIR}
	install -d ${SERVICEDIR}/ceph-mon@.service.d
	install -m 0644 ceph-after-pve-cluster.conf ${SERVICEDIR}/ceph-mon@.service.d
	install -d ${SERVICEDIR}/ceph-mgr@.service.d
	install -m 0644 ceph-after-pve-cluster.conf ${SERVICEDIR}/ceph-mgr@.service.d
	install -d ${SERVICEDIR}/ceph-osd@.service.d
	install -m 0644 ceph-after-pve-cluster.conf ${SERVICEDIR}/ceph-osd@.service.d
	install -d ${SERVICEDIR}/ceph-disk@.service.d
	install -m 0644 ceph-after-pve-cluster.conf ${SERVICEDIR}/ceph-disk@.service.d
	install -d ${SERVICEDIR}/ceph-mds@.service.d
	install -m 0644 ceph-after-pve-cluster.conf ${SERVICEDIR}/ceph-mds@.service.d
	install -d ${DESTDIR}/usr/share/doc/${PACKAGE}/examples/
	install -m 0644 ceph.service ${DESTDIR}/usr/share/doc/${PACKAGE}/examples/ceph.service

.PHONY: clean
clean:
	rm -rf *~
