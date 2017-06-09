include ../defines.mk
SUBDIRS = images css manager6 touch mobile

all: ${SUBDIRS} index.html.tpl

%:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: install
install:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
	install -m 0644 index.html.tpl ${WWWBASEDIR}

