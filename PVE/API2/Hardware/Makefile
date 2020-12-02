include ../../../defines.mk

PERLSOURCE=			\
	PCI.pm			\
	USB.pm			\

all:

.PHONY: clean
clean:
	rm -rf *~

.PHONY: install
install:
	install -d ${PERLLIBDIR}/PVE/API2/Hardware
	install -m 0644 ${PERLSOURCE} ${PERLLIBDIR}/PVE/API2/Hardware
