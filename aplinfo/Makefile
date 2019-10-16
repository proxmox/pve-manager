
DOCDIR=/usr/share/doc/pve-manager/

TRUSTED_KEYS=				\
	proxmox-release-5.x.pubkey 	\
	proxmox-release-6.x.pubkey 	\
	release@turnkeylinux.com.pubkey

all:

.PHONY: install
install: aplinfo.dat trustedkeys.gpg
	install -D -m 0644 aplinfo.dat ${DESTDIR}${DOCDIR}/aplinfo.dat
	install -D -m 0644 trustedkeys.gpg ${DESTDIR}${DOCDIR}/trustedkeys.gpg

.PHONY: update
update:
	rm -f aplinfo.dat
	wget http://download.proxmox.com/images/aplinfo-pve-6.dat -O aplinfo.dat.tmp
	mv aplinfo.dat.tmp aplinfo.dat

# Default list of GPG keys allowed to sign aplinfo, generated with:
# gpg --import-options show-only --import trustedkeys.gpg
# pub   rsa4096 2016-08-29 [SC] [expires: 2026-08-27]
#       359E95965E2C3D643159CD300D9A1950E2EF0603
# uid                      Proxmox Virtual Environment 5.x Release Key <proxmox-release@proxmox.com>
#
# pub   rsa4096 2018-11-19 [SC] [expires: 2028-11-16]
#       353479F83781D7F8ED5F5AC57BF2812E8A6E88E0
# uid                      Proxmox Virtual Environment 6.x Release Key <proxmox-release@proxmox.com>
#
# pub   rsa2048 2008-08-15 [SC] [expires: 2023-08-12]
#       694CFF26795A29BAE07B4EB585C25E95A16EB94D
# uid                      Turnkey Linux Release Key <release@turnkeylinux.com>
trustedkeys.gpg: ${TRUSTED_KEYS}
	rm -Rf tempgpg
	mkdir tempgpg
	chmod 700 tempgpg
	gpg --fingerprint --batch --no-tty --homedir tempgpg --import ${TRUSTED_KEYS}
	gpg --batch --no-tty --homedir tempgpg --export > trustedkeys.gpg

.PHONY: clean
clean:
	rm -rf *~ aplinfo.dat.gz aplinfo.dat.asc tempgpg
