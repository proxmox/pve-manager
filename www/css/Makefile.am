include $(top_builddir)/common.mk


css_DATA = 		\
	ext-pve.css

cssdir = ${WWW_CSSDIR}

install-data-hook:
	chown -R www-data:www-data ${DESTDIR}/${cssdir}

CLEANFILES= *~

