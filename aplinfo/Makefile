
DOCDIR=/usr/share/doc/pve-manager/

TRUSTED_KEYS=				\
	support@proxmox.com.pubkey 	\
	proxmox-release-5.x.pubkey 	\
	release@turnkeylinux.com.pubkey

all:

.PHONY: install
install: aplinfo.dat trustedkeys.gpg
	install -D -m 0644 aplinfo.dat ${DESTDIR}${DOCDIR}/aplinfo.dat
	install -D -m 0644 trustedkeys.gpg ${DESTDIR}${DOCDIR}/trustedkeys.gpg

.PHONY: update
update:
	rm -f aplinfo.dat
	wget http://download.proxmox.com/images/aplinfo.dat -O aplinfo.dat.tmp
	mv aplinfo.dat.tmp aplinfo.dat

# Default list of GPG keys allowed to sign aplinfo
# pub   1024D/5CAC72FE 2004-06-24
#       Key fingerprint = 9ABD 7E02 AD24 3AD3 C2FB  BCCC B0C1 CC22 5CAC 72FE
# uid                  Proxmox Support Team <support@proxmox.com>
# pub   4096R/E2EF0603 2016-08-29 [expires: 2026-08-27]
#       Key fingerprint = 359E 9596 5E2C 3D64 3159  CD30 0D9A 1950 E2EF 0603
# uid                  Proxmox Virtual Environment 5.x Release Key <proxmox-release@proxmox.com>
# pub   2048R/A16EB94D 2008-08-15 [expires: 2023-08-12]
#       Key fingerprint = 694C FF26 795A 29BA E07B  4EB5 85C2 5E95 A16E B94D
# uid                  Turnkey Linux Release Key <release@turnkeylinux.com>
trustedkeys.gpg: ${TRUSTED_KEYS}
	rm -Rf tempgpg
	mkdir tempgpg
	chmod 700 tempgpg
	gpg --fingerprint --batch --no-tty --homedir tempgpg --import ${TRUSTED_KEYS}
	gpg --batch --no-tty --homedir tempgpg --export > trustedkeys.gpg

.PHONY: clean
clean:
	rm -rf *~ aplinfo.dat.gz aplinfo.dat.asc tempgpg
