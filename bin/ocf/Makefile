include ../../defines.mk

all:

SCRIPTS = pvevm

.PHONY: install 
install: ${SCRIPTS}
	install -d ${HARADIR}
	install -m 0755 ${SCRIPTS} ${HARADIR}

.PHONY: clean
clean:
	rm -rf *~
