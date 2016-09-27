include ../../defines.mk

PERLSOURCE = 			\
	Plugin.pm

all:

.PHONY: clean
clean:
	rm -rf *~

.PHONY: install 
install: ${PERLSOURCE}
	install -d ${PERLLIBDIR}/PVE/VZDump
	install -m 0644 ${PERLSOURCE} ${PERLLIBDIR}/PVE/VZDump
