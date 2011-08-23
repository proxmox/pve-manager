include ../defines.mk

SUBDIRS = init.d cron test

SCRIPTS =  			\
	pvestatd		\
	pvesh			\
	pveam			\
	pvebanner		\
	pvectl			\
	pvedaemon		\
	pveversion		\
	pveperf

MANS = 				\
	pvestatd.1		\
	pvedaemon.1		\
	pveversion.1		\
	pveperf.1

all: ${MANS}

%.1: %
	pod2man -n $* -s 1 -r "proxmox ${VERSION}" -c "Proxmox Documentation" <$* >$*.1

.PHONY: install 
install: ${SCRIPTS} ${MANS}
	perl -I.. ./pvesh verifyapi
	install -d ${BINDIR}
	install -m 0755 ${SCRIPTS} ${BINDIR}
	install -d ${MAN1DIR}
	install -m 0644 ${MANS} ${MAN1DIR}
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: distclean
distclean: clean
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: clean
clean:
	rm -rf *~ ${MANS}
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
