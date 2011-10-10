include ../../defines.mk

all: 

.PHONY: install 
install: pve.conf pve-redirect.conf
	install -d ${DESTDIR}/etc/vz/conf
	install -d ${DESTDIR}/etc/apache2/sites-available/
	install -m 0644 pve.conf pve-redirect.conf ${DESTDIR}/etc/apache2/sites-available/

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	rm -rf *~
