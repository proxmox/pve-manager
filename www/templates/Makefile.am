include $(top_builddir)/common.mk

ve-pve.auto.conf-sample: generate.pl
	./generate.pl 256 > $@.tmp
	vzcfgvalidate $@.tmp
	mv $@.tmp $@


apache_DATA = $(BUILDDATA)

apachedir = /etc/apache2/sites-available/

vesample_DATA = ve-pve.auto.conf-sample

vesampledir = /etc/vz/conf

BUILDDATA = pve.conf pve-redirect.conf

CLEANFILES=*~ ve-pve.auto.conf-sample.tmp

