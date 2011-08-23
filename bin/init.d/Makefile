include ../../defines.mk

all:

SCRIPTS = 		\
	pvedaemon 	\
	pvebanner	\
	pvestatd	\
	pvenetcommit

.PHONY: install 
install: ${SCRIPTS}
	install -d ${INITDBINDIR}
	install -m 0755 ${SCRIPTS} ${INITDBINDIR}

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	rm -rf *~
