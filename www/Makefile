include ../defines.mk
SUBDIRS = images css manager6 touch mobile

all:

.PHONY: install
install:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
	install -m 0644 index.html.tpl ${WWWBASEDIR}
	install -d ${WWWJSDIR}
	install -m 0644 u2f-api.js ${WWWJSDIR}
	install -m 0644 qrcode.min.js ${WWWJSDIR}

.PHONY: check
check:
	${MAKE} -C manager6 $@

.PHONY: clean
clean:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
