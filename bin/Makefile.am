include $(top_builddir)/common.mk

SUBDIRS = init.d cron test

bin_SCRIPTS =  			\
	pvestatd		\
	pvesh			\
	pveam			\
	pvebanner		\
	pvectl			\
	pvedaemon		\
	pveversion		\
	pveperf

man_MANS = 			\
	pvestatd.1		\
	pvedaemon.1		\
	pveversion.1		\
	pveperf.1

CLEANFILES = $(man_MANS) *~

bindir = /usr/bin

install-exec-hook:
	perl -I$(top_builddir)/lib ./pvesh verifyapi
