include ../../../defines.mk

all:

.PHONY: install 
install: pve
	install -d ${CRONDAILYDIR}
	install -m 0755 pve ${CRONDAILYDIR}

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	rm -rf *~
