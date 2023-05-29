include /usr/share/dpkg/pkg-info.mk
include /usr/share/dpkg/architecture.mk
include defines.mk

export PVERELEASE = $(shell echo $(DEB_VERSION_UPSTREAM) | cut -c 1-3)
export VERSION = $(DEB_VERSION_UPSTREAM_REVISION)

DESTDIR=

SUBDIRS = aplinfo PVE bin www services configs network-hooks test

GITVERSION:=$(shell git rev-parse --short=16 HEAD)


BUILDDIR = $(PACKAGE)-$(DEB_VERSION_UPSTREAM)

DSC=$(PACKAGE)_$(DEB_VERSION).dsc
DEB=$(PACKAGE)_$(DEB_VERSION)_$(DEB_HOST_ARCH).deb

all: $(SUBDIRS)
	set -e && for i in $(SUBDIRS); do $(MAKE) -C $$i; done

.PHONY: check
check: bin test www
	$(MAKE) -C bin check
	$(MAKE) -C test check
	$(MAKE) -C www check

.PHONY: dinstall
dinstall: $(DEB)
	dpkg -i $(DEB)

$(BUILDDIR):
	rm -rf $@ $@.tmp
	mkdir $@.tmp
	rsync -a * $@.tmp
	echo "git clone git://git.proxmox.com/git/pve-manager.git\\ngit checkout $(GITVERSION)" >  $@.tmp/debian/SOURCE
	echo "REPOID_GENERATED=$(GITVERSION)" > $@.tmp/debian/rules.env
	mv $@.tmp $@

.PHONY: deb dsc
deb: $(DEB)
$(DEB): $(BUILDDIR)
	cd $(BUILDDIR); dpkg-buildpackage -b -us -uc
	lintian $(DEB)

dsc:
	rm -rf $(BUILDDIR) $(DSC)
	$(MAKE) $(DSC)
	lintian $(DSC)
$(DSC): $(BUILDDIR)
	cd $(BUILDDIR); dpkg-buildpackage -S -us -uc -d

sbuild: $(DSC)
	sbuild $<

.PHONY: upload
upload: UPLOAD_DIST ?= $(DEB_DISTRIBUTION)
upload: $(DEB)
	tar cf - $(DEB) | ssh -X repoman@repo.proxmox.com upload --product pve --dist $(UPLOAD_DIST)

.PHONY: install
install: vzdump-hook-script.pl
	install -d -m 0700 -o www-data -g www-data $(DESTDIR)/var/log/pveproxy
	install -d $(DOCDIR)/examples
	install -d $(DESTDIR)/var/lib/$(PACKAGE)
	install -d $(DESTDIR)/var/lib/vz/images
	install -d $(DESTDIR)/var/lib/vz/template/cache
	install -d $(DESTDIR)/var/lib/vz/template/iso
	install -m 0644 vzdump-hook-script.pl $(DOCDIR)/examples/vzdump-hook-script.pl
	install -m 0644 spice-example-sh $(DOCDIR)/examples/spice-example-sh
	set -e && for i in $(SUBDIRS); do $(MAKE) -C $$i $@; done

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	set -e && for i in $(SUBDIRS); do $(MAKE) -C $$i $@; done
	rm -f $(PACKAGE)*.tar* country.dat *.deb *.dsc *.build *.buildinfo *.changes
	rm -rf dest $(PACKAGE)-[0-9]*/
