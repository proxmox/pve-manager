
DOCDIR=/usr/share/doc/pve-manager/

TRUSTED_KEYS=				\
	proxmox-release-5.x.pubkey 	\
	proxmox-release-6.x.pubkey 	\
	proxmox-release-bullseye.pubkey	\
	release@turnkeylinux.com.pubkey

all:

.PHONY: install
install: aplinfo.dat trustedkeys.gpg
	install -D -m 0644 aplinfo.dat ${DESTDIR}${DOCDIR}/aplinfo.dat
	install -D -m 0644 trustedkeys.gpg ${DESTDIR}${DOCDIR}/trustedkeys.gpg

.PHONY: update
update:
	rm -f aplinfo.dat
	wget http://download.proxmox.com/images/aplinfo-pve-7.dat -O aplinfo.dat.tmp
	mv aplinfo.dat.tmp aplinfo.dat

%.gpg: %.pubkey
	gpg --dearmor -o $@ $<

trustedkeys.gpg: ${TRUSTED_KEYS:.pubkey=.gpg}
	cat $^ > $@

.PHONY: clean
clean:
	rm -rf *~ aplinfo.dat.gz aplinfo.dat.asc tempgpg *.gpg
