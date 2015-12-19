include ../../defines.mk

SOURCES=pvestatd.pm pveproxy.pm pvedaemon.pm spiceproxy.pm

all:

.PHONY: install
install: ${SOURCES}
	install -d -m 0755 ${PERLLIBDIR}/PVE/Service
	for i in ${SOURCES}; do install -D -m 0644 $$i ${PERLLIBDIR}/PVE/Service/$$i; done

clean:
