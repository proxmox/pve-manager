include ../defines.mk

SUBDIRS=API2 Status CLI Service

PERLSOURCE = 			\
	API2.pm			\
	API2Tools.pm		\
	HTTPServer.pm		\
	APLInfo.pm		\
	AutoBalloon.pm		\
	CephTools.pm		\
	Report.pm		\
	VZDump.pm

all: pvecfg.pm ${SUBDIRS}

REPOID=$(shell git rev-parse --short=8 HEAD)

pvecfg.pm: pvecfg.pm.in
	sed -e s/@VERSION@/${VERSION}/ -e s/@PACKAGERELEASE@/${PACKAGERELEASE}/ -e s/@PACKAGE@/${PACKAGE}/ -e s/@REPOID@/${REPOID}/ $< >$@.tmp
	mv $@.tmp $@

%:
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
