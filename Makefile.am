AUTOMAKE_OPTIONS = foreign

include $(top_builddir)/common.mk

SUBDIRS = bin lib www aplinfo po

DEB=${PACKAGE}_${VERSION}-${PACKAGERELEASE}_all.deb
CDATE:=$(shell date +%F)
SNAP=${PACKAGE}-${VERSION}-${CDATE}.tar.gz

vzconf_SCRIPTS = vznet.conf
vzconfdir = /etc/vz

.PHONY: dinstall
dinstall: ${DEB}
	dpkg -i ${DEB}

country.dat: country.pl
	./country.pl > country.dat

.PHONY: ${DEB}
${DEB} deb:
	./autogen.sh
	./configure
	make clean
	rm -rf dest
	mkdir dest
	make DESTDIR=`pwd`/dest install-strip
	mkdir dest/DEBIAN
	install -m 0644 debian/control dest/DEBIAN
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
	umount /pve/${RELEASE}; mount /pve/${RELEASE} -o rw 
	mkdir -p /pve/${RELEASE}/extra
	rm -f /pve/${RELEASE}/extra/${PACKAGE}_*.deb
	rm -f /pve/${RELEASE}/extra/Packages*
	cp ${DEB} /pve/${RELEASE}/extra
	cd /pve/${RELEASE}/extra; dpkg-scanpackages . /dev/null > Packages; gzip -9c Packages > Packages.gz
	umount /pve/${RELEASE}; mount /pve/${RELEASE} -o ro

.PHONY: poupload
poupload:
	rsync po/*.po po/pve-manager.pot pve.proxmox.com:/home/ftp/sources/po-files/

.PHONY: aplupload
aplupload:
	./aplinfo/apltest.pl
	gpg -bas -u support@proxmox.com aplinfo/aplinfo.dat
	gzip -c aplinfo/aplinfo.dat > aplinfo.dat.gz
	scp aplinfo/aplinfo.dat aplinfo.dat.gz aplinfo/aplinfo.dat.asc pve.proxmox.com:/home/ftp/appliances/

install-data-local: country.dat
	mkdir -p ${DESTDIR}/usr/share/${PACKAGE}
	mkdir -p ${DESTDIR}/usr/share/doc/${PACKAGE}
	mkdir -p ${DESTDIR}/var/lib/${PACKAGE}
	mkdir -p ${DESTDIR}/var/lib/vz/images
	mkdir -p ${DESTDIR}/var/lib/vz/template/cache
	mkdir -p ${DESTDIR}/var/lib/vz/template/iso
	mkdir -p ${DESTDIR}/var/lib/vz/template/qemu
	install -m 0644 copyright ${DESTDIR}/usr/share/doc/${PACKAGE}
	install -m 0644 debian/changelog.Debian ${DESTDIR}/usr/share/doc/${PACKAGE}
	install -m 0644 country.dat ${DESTDIR}/usr/share/${PACKAGE}


CLEANFILES=*~ *.deb debian/*~ dest ${PACKAGE}-*.tar.gz ${SNAP} country.dat

.PHONY: snap
${SNAP} snap: clean
	rm -f ../${SNAP}
	cd ..; tar cvzf ${SNAP} --exclude .svn --exclude autom4te.cache ${PACKAGE} 
	mv ../${SNAP} ${SNAP}

.PHONY: uploadsnap  
uploadsnap: ${SNAP}
	scp ${SNAP} pve.proxmox.com:/home/ftp/sources/

#ACLOCAL_AMFLAGS = -I m4
#EXTRA_DIST = config.rpath m4/ChangeLog
