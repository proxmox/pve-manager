include ../defines.mk

SUBDIRS=API2 Status CLI Service Ceph Jobs

PERLSOURCE = 			\
	API2.pm			\
	API2Tools.pm		\
	APLInfo.pm		\
	AutoBalloon.pm		\
	CertCache.pm		\
	CertHelpers.pm		\
	ExtMetric.pm		\
	HTTPServer.pm		\
	Jobs.pm			\
	NodeConfig.pm		\
	Report.pm		\
	VZDump.pm

all: pvecfg.pm $(SUBDIRS)
	set -e && for i in $(SUBDIRS); do $(MAKE) -C $$i; done

REPOID ?= $(or $(GITVERSION), $(shell git rev-parse --short=16 HEAD), unknown)
pvecfg.pm: pvecfg.pm.in
	sed 's/@VERSION@/$(VERSION)/;s/@PVERELEASE@/$(PVERELEASE)/;s/@PACKAGE@/$(PACKAGE)/;s/@REPOID@/$(REPOID)/' $< >$@.tmp
	mv $@.tmp $@

%:
	set -e && for i in $(SUBDIRS); do $(MAKE) -C $$i $@; done

.PHONY: clean
clean:
	set -e && for i in $(SUBDIRS); do $(MAKE) -C $$i $@; done
	rm -rf *~ pvecfg.pm pvecfg.pm.tmp

.PHONY: install 
install: pvecfg.pm $(PERLSOURCE)
	install -d $(PERLLIBDIR)/PVE
	install -m 0644 pvecfg.pm $(PERLLIBDIR)/PVE/
	install -m 0644 $(PERLSOURCE) $(PERLLIBDIR)/PVE/
	set -e && for i in $(SUBDIRS); do $(MAKE) -C $$i $@; done
