include $(top_builddir)/common.mk

SUBDIRS= API2

PERLSOURCE = 			\
	API2.pm			\
	API2Client.pm		\
	APIDaemon.pm		\
	REST.pm			\
	APLInfo.pm

BUILDDATA = pvecfg.pm

pvelib_DATA = $(BUILDDATA) $(PERLSOURCE)

CLEANFILES = $(BUILDDATA) *~

pvelibdir = @PERL_LIBDIR@/PVE
