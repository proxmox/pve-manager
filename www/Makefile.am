include $(top_builddir)/common.mk

SUBDIRS = templates images ext4 css manager

install-data-hook:
	chown -R www-data:www-data ${DESTDIR}${WWW_BASEDIR}

CLEANFILES=*~

