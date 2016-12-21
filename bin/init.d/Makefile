include ../../defines.mk

all:

SCRIPTS = 		\
	pve-manager 	\
	pvedaemon 	\
	pveproxy 	\
	spiceproxy 	\
	pvestatd


SERVICES=			\
	pvebanner.service 	\
	pvenetcommit.service 	\
	pvestatd.service 	\
	pve-manager.service 	\
	pvedaemon.service  	\
	pveproxy.service 	\
	spiceproxy.service

.PHONY: install 
install: ${SCRIPTS}
	install -d ${INITDBINDIR}
	install -m 0755 ${SCRIPTS} ${INITDBINDIR}
	install -d ${SERVICEDIR}
	install -m 0644 ${SERVICES} ${SERVICEDIR}
	install -d ${SERVICEDIR}/ceph-mon@.service.d
	install -m 0644 pve.conf ${SERVICEDIR}/ceph-mon@.service.d
	install -d ${SERVICEDIR}/ceph-osd@.service.d
	install -m 0644 pve.conf ${SERVICEDIR}/ceph-osd@.service.d
	install -d ${SERVICEDIR}/ceph-disk@.service.d
	install -m 0644 pve.conf ${SERVICEDIR}/ceph-disk@.service.d
	install -d ${SERVICEDIR}/ceph-mds@.service.d
	install -m 0644 pve.conf ${SERVICEDIR}/ceph-mds@.service.d
	install -d ${DESTDIR}/usr/share/doc/{$PACKAGE}/examples/
	install -m 0644 ceph.service ${DESTDIR}/usr/share/doc/${PACKAGE}/examples/ceph.service

.PHONY: clean
clean:
	rm -rf *~
