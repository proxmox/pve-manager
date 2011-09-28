include ../defines.mk

SUBDIRS=API2

PERLSOURCE = 			\
	API2.pm			\
	API2Client.pm		\
	APIDaemon.pm		\
	REST.pm			\
	OpenVZ.pm		\
	APLInfo.pm

all: pvecfg.pm ${SUBDIRS}

REPOID=`../repoid.pl ../.git`

pvecfg.pm: pvecfg.pm.in
	sed -e s/@VERSION@/${VERSION}/ -e s/@PACKAGE@/${PACKAGE}/ -e s/@REPOID@/${REPOID}/ $< >$@.tmp
	mv $@.tmp $@

%:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: distclean
distclean: clean
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: clean
clean:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
	rm -rf *~ pvecfg.pm pvecfg.pm.tmp

.PHONY: install 
install: pvecfg.pm ${PERLSOURCE}
	install -d ${PERLLIBDIR}/PVE
	install -m 0644 pvecfg.pm ${PERLLIBDIR}/PVE/
	install -m 0644 ${PERLSOURCE} ${PERLLIBDIR}/PVE/
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
