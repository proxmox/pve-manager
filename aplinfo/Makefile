
DOCDIR=/usr/share/doc/pve-manager/

all:

.PHONY: install
install: aplinfo.dat support@proxmox.com.pubkey
	install -D -m 0644 aplinfo.dat ${DESTDIR}${DOCDIR}/aplinfo.dat
	install -D -m 0644 support@proxmox.com.pubkey ${DESTDIR}${DOCDIR}/support@proxmox.com.pubkey

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	rm -rf *~ aplinfo.dat.gz aplinfo.dat.asc
