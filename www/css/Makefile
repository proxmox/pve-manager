include ../../defines.mk

all:

.PHONY: install
install: ext6-pve.css
	install -d ${WWWCSSDIR}
	install -m 0644 $? ${WWWCSSDIR}

.PHONY: clean
clean:
	rm -rf *~
