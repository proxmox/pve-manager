
DOCDIR=/usr/share/doc/pve-manager/

all:

.PHONY: install
install: aplinfo.dat support@proxmox.com.pubkey
	install -D -m 0644 aplinfo.dat ${DESTDIR}${DOCDIR}/aplinfo.dat
	install -D -m 0644 support@proxmox.com.pubkey ${DESTDIR}${DOCDIR}/support@proxmox.com.pubkey
	install -D -m 0644 release@turnkeylinux.com.pubkey ${DESTDIR}${DOCDIR}/release@turnkeylinux.com.pubkey

.PHONY: update
update:
	rm -f aplinfo.dat
	wget http://download.proxmox.com/images/aplinfo.dat -O aplinfo.dat.tmp
	mv aplinfo.dat.tmp aplinfo.dat

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	rm -rf *~ aplinfo.dat.gz aplinfo.dat.asc
