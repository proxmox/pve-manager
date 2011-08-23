include ../../defines.mk

all: ve-pve.auto.conf-sample

ve-pve.auto.conf-sample: generate.pl
	./generate.pl 256 > $@.tmp
	echo FIXME: vzcfgvalidate $@.tmp
	mv $@.tmp $@

.PHONY: install 
install: ve-pve.auto.conf-sample pve.conf pve-redirect.conf
	install -d ${DESTDIR}/etc/vz/conf
	install -m 0644 ve-pve.auto.conf-sample ${DESTDIR}/etc/vz/conf
	install -d ${DESTDIR}/etc/apache2/sites-available/
	install -m 0644 pve.conf pve-redirect.conf ${DESTDIR}/etc/apache2/sites-available/

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	rm -rf *~ ve-pve.auto.conf-sample ve-pve.auto.conf-sample.tmp
