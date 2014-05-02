include ../../defines.mk

BTDIR=bootstrap-3.1.1-dist
BTSRC=${BTDIR}.zip

BTDATA = 					\
	${BTDIR}/css/bootstrap.min.css		\
	${BTDIR}/js/bootstrap.min.js

${BTDATA}: ${BTSRC}
	rm -rf ${BTDIR}
	unzip -x ${BTSRC}
	touch $@

all: ${BTDATA}

.PHONY: install 
install: ${BTDATA}
	install -d ${WWWCSSDIR}
	install -m 0644 -o www-data -g www-data ${BTDIR}/css/bootstrap.min.css ${WWWCSSDIR}
	install -d ${WWWJSDIR}
	install -m 0644 -o www-data -g www-data ${BTDIR}/js/bootstrap.min.js ${WWWJSDIR}

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	rm -rf *~ ${BTDIR}

