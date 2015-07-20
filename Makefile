all:
	pandoc \
		-s \
		-H bootstrap.css \
		-A scripts.js \
		-o Base64_patch.html \
		Base64_patch.md


