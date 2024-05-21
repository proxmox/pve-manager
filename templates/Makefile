NOTIFICATION_TEMPLATES=					\
	default/test-subject.txt.hbs			\
	default/test-body.txt.hbs			\
	default/test-body.html.hbs			\
	default/vzdump-subject.txt.hbs			\
	default/vzdump-body.txt.hbs			\
	default/vzdump-body.html.hbs			\
	default/replication-subject.txt.hbs		\
	default/replication-body.txt.hbs		\
	default/replication-body.html.hbs		\
	default/package-updates-subject.txt.hbs		\
	default/package-updates-body.txt.hbs		\
	default/package-updates-body.html.hbs		\

all:

.PHONY: install
install:
	install -dm 0755 $(DESTDIR)/usr/share/pve-manager/templates/default
	$(foreach i,$(NOTIFICATION_TEMPLATES), \
	    install -m644 $(i) $(DESTDIR)/usr/share/pve-manager/templates/$(i) ;)


clean:
