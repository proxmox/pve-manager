include ../../defines.mk


JSSRC= 				                 	\
	../ext4/extjs/src/util/Cookies.js		\
	../manager/Utils.js				\
	../manager/Parser.js				\
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
	chown -R www-data:www-data ${WWWTOUCHDIR}

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	rm -rf *~ pvemanager-mobile.js

