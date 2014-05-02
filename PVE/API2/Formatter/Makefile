include ../../../defines.mk

PERLSOURCE = 			\
	Bootstrap.pm		\
	HTML.pm			\
	Standard.pm

all:

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	rm -rf *~

.PHONY: install 
install: ${PERLSOURCE}
	install -d ${PERLLIBDIR}/PVE/API2/Formatter
	install -m 0644 ${PERLSOURCE} ${PERLLIBDIR}/PVE/API2/Formatter
