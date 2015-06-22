include ../../defines.mk

PERLSOURCE = 			\
	Graphite.pm		\
	Plugin.pm

all:

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	rm -rf *~

.PHONY: install 
install: ${PERLSOURCE}
	install -d ${PERLLIBDIR}/PVE/Status
	install -m 0644 ${PERLSOURCE} ${PERLLIBDIR}/PVE/Status
