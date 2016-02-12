include ../../defines.mk

all:

.PHONY: install 
install: ext-pve.css ext6-pve.css
	install -d ${WWWCSSDIR}
	install -m 0644 -o www-data -g www-data $? ${WWWCSSDIR}

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	rm -rf *~
