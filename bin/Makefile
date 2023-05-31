include ../defines.mk

PERL_DOC_INC_DIRS=..
-include /usr/share/pve-doc-generator/pve-doc-generator.mk

SERVICES = pvestatd pveproxy pvedaemon spiceproxy pvescheduler
CLITOOLS = \
	vzdump \
	pvesubscription \
	pveceph \
	pveam \
	pvesr \
	pvenode \
	pvesh \
	pve6to7 \


SCRIPTS =  			\
	$(SERVICES)		\
	$(CLITOOLS)		\
	pvebanner		\
	pveversion		\
	pveupgrade		\
	pveupdate		\
	pveperf			\
	pvereport

SERVICE_MANS = $(addsuffix .8, $(SERVICES))

CLI_MANS = 				\
	$(addsuffix .1, $(CLITOOLS))	\
	pveversion.1			\
	pveupgrade.1			\
	pveperf.1			\
	pvereport.1			\

BASH_COMPLETIONS = 						\
	$(addsuffix .service-bash-completion, $(SERVICES)) 	\
	$(addsuffix .bash-completion, $(CLITOOLS)) 		\

ZSH_COMPLETIONS =						\
	$(addsuffix .service-zsh-completion, $(SERVICES)) 	\
	$(addsuffix .zsh-completion, $(CLITOOLS))		\

all: $(SERVICE_MANS) $(CLI_MANS)

%.1: %.1.pod
	rm -f $@
	cat $<|pod2man -n $* -s 1 -r $(VERSION) -c"Proxmox Documentation" - >$@.tmp
	mv $@.tmp $@

%.1.pod:
	podselect $* > $@.tmp
	mv $@.tmp $@

pve6to7.1:
	printf ".TH PVE6TO7 1\n.SH NAME\npve6to7 \- Proxmox VE upgrade checker script for 6.4 to 7.x\n" > $@
	printf ".SH SYNOPSIS\npve6to7 [--full]\n" >> $@

pveversion.1.pod: pveversion
pveupgrade.1.pod: pveupgrade
pvereport.1.pod: pvereport

.PHONY: check
check: $(addsuffix .service-api-verified, $(SERVICES)) $(addsuffix .api-verified, $(CLITOOLS))
	rm -f *.service-api-verified *.api-verified

.PHONY: install
install: $(SCRIPTS) $(CLI_MANS) $(SERVICE_MANS) $(BASH_COMPLETIONS) $(ZSH_COMPLETIONS)
	install -d $(BINDIR)
	install -m 0755 $(SCRIPTS) $(BINDIR)
	install -d $(USRSHARE)/helpers
	install -m 0755 pve-startall-delay $(USRSHARE)/helpers
	install -d $(MAN1DIR)
	install -m 0644 $(CLI_MANS) $(MAN1DIR)
	install -d $(MAN8DIR)
	install -m 0644 $(SERVICE_MANS) $(MAN8DIR)
	for i in $(CLITOOLS); do install -m 0644 -D $$i.bash-completion $(BASHCOMPLDIR)/$$i; done
	for i in $(SERVICES); do install -m 0644 -D $$i.service-bash-completion $(BASHCOMPLDIR)/$$i; done
	for i in $(CLITOOLS); do install -m 0644 -D $$i.zsh-completion $(ZSHCOMPLDIR)/_$$i; done
	for i in $(SERVICES); do install -m 0644 -D $$i.service-zsh-completion $(ZSHCOMPLDIR)/_$$i; done

.PHONY: clean
clean:
	rm -f *.xml.tmp *.1 *.5 *.8 *{synopsis,opts}.adoc docinfo.xml
	rm -f *~ *.tmp $(CLI_MANS) $(SERVICE_MANS) *.1.pod *.8.pod
	rm -f *.bash-completion *.service-bash-completion *.zsh-completion *.service-zsh-completion
	rm -f *.api-verified *.service-api-verified
