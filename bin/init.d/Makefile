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

.PHONY: clean
clean:
	rm -rf *~
