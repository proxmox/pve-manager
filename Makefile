include defines.mk

DESTDIR=

#SUBDIRS = bin lib www aplinfo
SUBDIRS = aplinfo PVE bin www po

DEB=${PACKAGE}_${VERSION}-${PACKAGERELEASE}_all.deb

all: ${SUBDIRS}

%:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done


.PHONY: dinstall
dinstall: ${DEB}
	dpkg -i ${DEB}

country.dat: country.pl
	./country.pl > country.dat

.PHONY: ${DEB}
${DEB} deb:
	make clean
	rm -rf dest
	mkdir dest
	make DESTDIR=`pwd`/dest install
	mkdir dest/DEBIAN
	sed -e s/@VERSION@/${VERSION}/ -e s/@PACKAGE@/${PACKAGE}/ -e s/@PACKAGERELEASE@/${PACKAGERELEASE}/ debian/control.in >dest/DEBIAN/control
	install -m 0644 debian/conffiles dest/DEBIAN
	install -m 0755 debian/config dest/DEBIAN
	install -m 0644 debian/templates dest/DEBIAN
	install -m 0755 debian/postinst dest/DEBIAN
	install -m 0755 debian/prerm dest/DEBIAN
	install -m 0755 debian/postrm dest/DEBIAN
	install -m 0644 debian/triggers dest/DEBIAN
	gzip --best dest/usr/share/man/*/*
	gzip --best dest/usr/share/doc/${PACKAGE}/changelog.Debian
	dpkg-deb --build dest
	mv dest.deb ${DEB}
	rm -rf dest
	lintian ${DEB}	

.PHONY: upload
upload: ${DEB}
	./repoid.pl .git check
	umount /pve/${RELEASE}; mount /pve/${RELEASE} -o rw 
	mkdir -p /pve/${RELEASE}/extra
	rm -f /pve/${RELEASE}/extra/${PACKAGE}_*.deb
	rm -f /pve/${RELEASE}/extra/Packages*
	cp ${DEB} /pve/${RELEASE}/extra
	cd /pve/${RELEASE}/extra; dpkg-scanpackages . /dev/null > Packages; gzip -9c Packages > Packages.gz
	umount /pve/${RELEASE}; mount /pve/${RELEASE} -o ro

#.PHONY: poupload
#poupload:
#	rsync po/*.po po/pve-manager.pot pve.proxmox.com:/home/ftp/sources/po-files/

#.PHONY: aplupload
#aplupload:
#	./aplinfo/apltest.pl
#	gpg -bas -u support@proxmox.com aplinfo/aplinfo.dat
#	gzip -c aplinfo/aplinfo.dat > aplinfo.dat.gz
#	scp aplinfo/aplinfo.dat aplinfo.dat.gz aplinfo/aplinfo.dat.asc pve.proxmox.com:/home/ftp/appliances/

.PHONY: install
install: country.dat vznet.conf vzdump.conf vzdump-hook-script.pl
	install -d ${DESTDIR}/usr/share/${PACKAGE}
	install -d ${DESTDIR}/usr/share/man/man1
	install -d ${DOCDIR}/examples
	install -d ${DESTDIR}/var/lib/${PACKAGE}
	install -d ${DESTDIR}/var/lib/vz/images
	install -d ${DESTDIR}/var/lib/vz/template/cache
	install -d ${DESTDIR}/var/lib/vz/template/iso
	install -d ${DESTDIR}/var/lib/vz/template/qemu
	install -D -m 0644 vzdump.conf ${DESTDIR}/etc/vzdump.conf
	install -D -m 0755 vznet.conf ${DESTDIR}/etc/vz/vznet.conf
	install -m 0644 vzdump-hook-script.pl ${DOCDIR}/examples/vzdump-hook-script.pl
	install -m 0644 copyright ${DOCDIR}
	install -m 0644 debian/changelog.Debian ${DOCDIR}
	install -m 0644 country.dat ${DESTDIR}/usr/share/${PACKAGE}
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: distclean
distclean: clean
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: clean
clean:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
	find . -name '*~' -exec rm {} ';'
	rm -rf dest country.dat *.deb
