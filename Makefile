include defines.mk

export SOURCE_DATE_EPOCH ?= $(shell dpkg-parsechangelog -STimestamp)

DESTDIR=

SUBDIRS = aplinfo PVE bin www services configs

ARCH:=$(shell dpkg-architecture -qDEB_BUILD_ARCH)
GITVERSION:=$(shell git rev-parse HEAD)

DEB=${PACKAGE}_${VERSION}-${PACKAGERELEASE}_${ARCH}.deb

all: ${SUBDIRS}

check:
	${MAKE} -C bin/test check

.PHONY: dinstall
dinstall: ${DEB}
	dpkg -i ${DEB}

.PHONY: deb
deb: $(DEB)
$(DEB):
	rm -rf dest
	mkdir dest
	rsync -a * dest
	echo "git clone git://git.proxmox.com/git/pve-manager.git\\ngit checkout ${GITVERSION}" >  dest/debian/SOURCE
	cd dest; dpkg-buildpackage -b -us -uc
	# supress lintian error: statically-linked-binary usr/bin/pvemailforward
	lintian -X binaries ${DEB}

.PHONY: upload
upload: ${DEB} check
	# check if working directory is clean
	git diff --exit-code --stat && git diff --exit-code --stat --staged
	tar cf - ${DEB} | ssh -X repoman@repo.proxmox.com upload --product pve --dist stretch

.PHONY: install
install: vzdump-hook-script.pl mtu bridgevlan bridgevlanport vlan vlan-down
	install -d -m 0700 -o www-data -g www-data ${DESTDIR}/var/log/pveproxy
	install -d ${DESTDIR}/usr/share/${PACKAGE}
	install -d ${DESTDIR}/usr/share/man/man1
	install -d ${DOCDIR}/examples
	install -d ${DESTDIR}/var/lib/${PACKAGE}
	install -d ${DESTDIR}/var/lib/vz/images
	install -d ${DESTDIR}/var/lib/vz/template/cache
	install -d ${DESTDIR}/var/lib/vz/template/iso
	install -d ${DESTDIR}/var/lib/vz/template/qemu
	install -D -m 0755 mtu ${DESTDIR}/etc/network/if-up.d/mtu
	install -D -m 0755 bridgevlan ${DESTDIR}/etc/network/if-up.d/bridgevlan
	install -D -m 0755 bridgevlanport ${DESTDIR}/etc/network/if-up.d/bridgevlanport
	install -D -m 0755 vlan ${DESTDIR}/etc/network/if-pre-up.d/vlan
	install -D -m 0755 vlan-down ${DESTDIR}/etc/network/if-post-down.d/vlan

	install -m 0644 vzdump-hook-script.pl ${DOCDIR}/examples/vzdump-hook-script.pl
	install -m 0644 spice-example-sh ${DOCDIR}/examples/spice-example-sh

	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
	find . -name '*~' -exec rm {} ';'
	rm -rf dest country.dat *.deb *.buildinfo *.changes ca-tmp
