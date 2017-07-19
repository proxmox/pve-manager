include ../defines.mk

# this requires package pve-doc-generator
export NOVIEW=1
include /usr/share/pve-doc-generator/pve-doc-generator.mk

export PERLLIB=..

SUBDIRS = init.d ocf test

SERVICES = pvestatd pveproxy pvedaemon spiceproxy
CLITOOLS = vzdump pvesubscription pveceph pveam pvesr

SCRIPTS =  			\
	${SERVICES}		\
	${CLITOOLS}		\
	pvesh			\
	pvebanner		\
	pveversion		\
	pvemailforward.pl	\
	pveupgrade		\
	pveupdate		\
	pveperf			\
	pvereport

SERVICE_MANS = $(addsuffix .8, ${SERVICES})

CLI_MANS = 				\
	$(addsuffix .1, ${CLITOOLS})	\
	pveversion.1			\
	pveupgrade.1			\
	pveperf.1			\
	pvesh.1				\
	pvereport.1			\


all: ${SERVICE_MANS} ${CLI_MANS} pvemailforward

%.1: %.1.pod
	rm -f $@
	cat $<|pod2man -n $* -s 1 -r ${VERSION} -c "Proxmox Documentation" >$@.tmp
	mv $@.tmp $@

pveversion.1.pod: pveversion
	podselect $< > $@.tmp
	mv $@.tmp $@

pveupgrade.1.pod: pveupgrade
	podselect $< > $@.tmp
	mv $@.tmp $@

pvesh.1.pod: pvesh
	podselect $< > $@.tmp
	mv $@.tmp $@

pvereport.1.pod: pvereport
	podselect $< > $@.tmp
	mv $@.tmp $@

%.service-bash-completion:
	perl -I.. -T -e "use PVE::Service::$*; PVE::Service::$*->generate_bash_completions();" >$@.tmp
	mv $@.tmp $@

%.bash-completion:
	perl -I.. -T -e "use PVE::CLI::$*; PVE::CLI::$*->generate_bash_completions();" >$@.tmp
	mv $@.tmp $@

pvemailforward: pvemailforward.c
	$(CC) $(CPPFLAGS) $(CFLAGS) -Wall -g -O2 $< -o $@

.PHONY: install
install: ${SCRIPTS} ${CLI_MANS} ${SERVICE_MANS} pvemailforward $(addsuffix .service-bash-completion, ${SERVICES}) $(addsuffix .bash-completion, ${CLITOOLS})
	perl -I.. ./pvesh verifyapi
	for i in ${CLITOOLS}; do perl -I.. -T -e "use PVE::CLI::$$i; PVE::CLI::$$i->verify_api();"; done
	for i in ${SERVICES}; do perl -I.. -T -e "use PVE::Service::$$i; PVE::Service::$$i->verify_api();"; done
	install -d ${BINDIR}
	install -m 0755 ${SCRIPTS} ${BINDIR}
	install -s -m 2755 -g www-data pvemailforward ${BINDIR}
	install -d ${MAN1DIR}
	install -m 0644 ${CLI_MANS} ${MAN1DIR}
	install -d ${MAN8DIR}
	install -m 0644 ${SERVICE_MANS} ${MAN8DIR}
	for i in ${CLITOOLS}; do install -m 0644 -D $$i.bash-completion ${BASHCOMPLDIR}/$$i; done
	for i in ${SERVICES}; do install -m 0644 -D $$i.service-bash-completion ${BASHCOMPLDIR}/$$i; done
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: clean
clean:
	make cleanup-docgen
	rm -rf *~ *.tmp ${CLI_MANS} ${SERVICE_MANS} *.1.pod *.8.pod pvemailforward *.bash-completion *.service-bash-completion
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
