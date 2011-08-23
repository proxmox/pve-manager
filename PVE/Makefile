include ../defines.mk

SUBDIRS=API2

PERLSOURCE = 			\
	API2.pm			\
	API2Client.pm		\
	APIDaemon.pm		\
	REST.pm			\
	APLInfo.pm

all: pvecfg.pm ${SUBDIRS}

pvecfg.pm: pvecfg.pm.in
	sed -e s/@VERSION@/${VERSION}/ -e s/@PACKAGE@/${PACKAGE}/ $< >$@

%:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: distclean
distclean: clean
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: clean
clean:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
	rm -rf *~ pvecfg.pm

.PHONY: install 
install: pvecfg.pm ${PERLSOURCE}
	install -d ${PERLLIBDIR}/PVE
	install -m 0644 pvecfg.pm ${PERLLIBDIR}/PVE/
	install -m 0644 ${PERLSOURCE} ${PERLLIBDIR}/PVE/
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
