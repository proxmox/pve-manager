include ../../defines.mk

all:

check:
	./balloontest.pl

SCRIPTS = 		\
	example1.pl	\
	example2.pl

.PHONY: install 
install: ${SCRIPTS}
	install -d ${DOCDIR}/examples
	install -m 0755 ${SCRIPTS} ${DOCDIR}/examples

.PHONY: clean
clean:
	rm -rf *~
