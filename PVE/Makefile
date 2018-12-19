include ../defines.mk

SUBDIRS=API2 Status CLI Service Ceph

PERLSOURCE = 			\
	CertHelpers.pm		\
	API2.pm			\
	API2Tools.pm		\
	HTTPServer.pm		\
	APLInfo.pm		\
	AutoBalloon.pm		\
	Report.pm		\
	NodeConfig.pm		\
	VZDump.pm

all: pvecfg.pm ${SUBDIRS}
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i; done

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
