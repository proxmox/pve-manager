include ../../defines.mk

# Note: Cookies.js is copied from ExtJS sources
# extjs/classic/classic/src/util/Cookies.js

JSSRC= 				                 	\
	Cookies.js 					\
	../manager6/Utils.js				\
	../manager6/Parser.js				\
	Toolkit.js					\
	PVEProxy.js					\
	MenuButton.js					\
	PVEBar.js					\
	Workspace.js					\
	NodeSelector.js					\
	RealmSelector.js				\
	Login.js					\
	TaskList.js					\
	TaskViewer.js					\
	Datacenter.js					\
	NodeSummary.js					\
	Migrate.js					\
	VMSummaryBase.js				\
	QemuSummary.js					\
	LXCSummary.js				\
	app.js

all: pvemanager-mobile.js

pvemanager-mobile.js: ${JSSRC}
	cat ${JSSRC} >$@.tmp
	mv $@.tmp $@

.PHONY: install 
install: pvemanager-mobile.js
	install -d ${WWWTOUCHDIR}
	install -m 0644 pvemanager-mobile.js ${WWWTOUCHDIR}

.PHONY: clean
clean:
	rm -rf *~ pvemanager-mobile.js

